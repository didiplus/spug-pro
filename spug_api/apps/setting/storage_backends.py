import os
import json
import logging
from typing import Optional, Tuple, Dict

logger = logging.getLogger(__name__)


def _get_remote_key(config: dict, filename: str) -> str:
    prefix = (config.get('prefix') or '').strip('/')
    return f"{prefix}/{filename}" if prefix else filename


def _guess_content_type(filename: str) -> str:
    if filename.endswith('.gz') or filename.endswith('.tgz'):
        return 'application/gzip'
    if filename.endswith('.sql'):
        return 'text/plain'
    if filename.endswith('.tar'):
        return 'application/x-tar'
    if filename.endswith('.zip'):
        return 'application/zip'
    return 'application/octet-stream'


class StorageBackend:
    """存储后端抽象基类"""

    def __init__(self, config: dict):
        self.config = config
        self.bucket = config.get('bucket')
        if not self.bucket:
            raise ValueError("Bucket name is required")

    def upload(self, local_path: str) -> Tuple[str, str]:
        raise NotImplementedError

    def download(self, remote_key: str, local_path: str) -> str:
        raise NotImplementedError

    def delete(self, remote_key: str) -> bool:
        raise NotImplementedError

    def test_connection(self) -> dict:
        raise NotImplementedError

    def _uri(self, remote_key: str) -> str:
        return f"{self.config.get('storage_type', 's3')}://{self.bucket}/{remote_key}"


class S3Backend(StorageBackend):
    """S3 兼容存储（AWS S3 / MinIO / Ceph / 阿里云 S3 兼容）"""

    def __init__(self, config: dict):
        super().__init__(config)
        try:
            import boto3
            from botocore.exceptions import ClientError, NoCredentialsError
        except ImportError:
            raise ImportError("boto3 is not installed, run: pip install boto3")
        self._boto3 = boto3
        self._ClientError = ClientError
        self._NoCredentialsError = NoCredentialsError
        self._client = boto3.client(
            's3',
            endpoint_url=config.get('endpoint_url') or None,
            aws_access_key_id=config.get('access_key'),
            aws_secret_access_key=config.get('secret_key'),
            region_name=config.get('region') or None,
        )

    def upload(self, local_path: str) -> Tuple[str, str]:
        if not os.path.exists(local_path):
            raise FileNotFoundError(f"Local file not found: {local_path}")
        filename = os.path.basename(local_path)
        remote_key = _get_remote_key(self.config, filename)
        extra_args = {'ContentType': _guess_content_type(filename)}
        self._client.upload_file(local_path, self.bucket, remote_key, ExtraArgs=extra_args)
        logger.info(f"S3 upload: {self.bucket}/{remote_key}")
        return remote_key, self._uri(remote_key)

    def download(self, remote_key: str, local_path: str) -> str:
        self._client.download_file(self.bucket, remote_key, local_path)
        logger.info(f"S3 download: {self.bucket}/{remote_key} -> {local_path}")
        return local_path

    def delete(self, remote_key: str) -> bool:
        try:
            self._client.delete_object(Bucket=self.bucket, Key=remote_key)
            logger.info(f"S3 delete: {self.bucket}/{remote_key}")
            return True
        except Exception as e:
            logger.warning(f"S3 delete failed: {self.bucket}/{remote_key}, {e}")
            return False

    def test_connection(self) -> dict:
        try:
            self._client.head_bucket(Bucket=self.bucket)
            location = self._client.get_bucket_location(Bucket=self.bucket)
            region = location.get('LocationConstraint') or 'us-east-1'
            return {'success': True, 'message': '连接成功', 'bucket': self.bucket, 'region': region}
        except self._NoCredentialsError:
            return {'success': False, 'message': '凭证无效，请检查 AccessKey / SecretKey'}
        except self._ClientError as e:
            code = e.response.get('Error', {}).get('Code', 'Unknown')
            if code in ('404', 'NoSuchBucket'):
                return {'success': False, 'message': f'Bucket "{self.bucket}" 不存在'}
            if code in ('403', 'AccessDenied'):
                return {'success': False, 'message': '访问被拒绝，请检查权限或凭证'}
            return {'success': False, 'message': f'S3 错误 [{code}]: {e}'}
        except Exception as e:
            return {'success': False, 'message': f'连接错误: {e}'}


class OSSBackend(StorageBackend):
    """阿里云 OSS（原生 oss2 SDK）"""

    def __init__(self, config: dict):
        super().__init__(config)
        try:
            import oss2
        except ImportError:
            raise ImportError("oss2 is not installed, run: pip install oss2")
        self._oss2 = oss2
        endpoint = config.get('endpoint_url')
        if not endpoint:
            region = config.get('region', 'cn-hangzhou')
            endpoint = f"https://oss-{region}.aliyuncs.com"
        auth = oss2.Auth(config['access_key'], config['secret_key'])
        self._bucket = oss2.Bucket(auth, endpoint, self.bucket)

    def upload(self, local_path: str) -> Tuple[str, str]:
        if not os.path.exists(local_path):
            raise FileNotFoundError(f"Local file not found: {local_path}")
        filename = os.path.basename(local_path)
        remote_key = _get_remote_key(self.config, filename)
        content_type = _guess_content_type(filename)
        headers = {'Content-Type': content_type}
        self._bucket.put_object_from_file(remote_key, local_path, headers=headers)
        logger.info(f"OSS upload: {self.bucket}/{remote_key}")
        return remote_key, self._uri(remote_key)

    def download(self, remote_key: str, local_path: str) -> str:
        self._bucket.get_object_to_file(remote_key, local_path)
        logger.info(f"OSS download: {self.bucket}/{remote_key} -> {local_path}")
        return local_path

    def delete(self, remote_key: str) -> bool:
        try:
            self._bucket.delete_object(remote_key)
            logger.info(f"OSS delete: {self.bucket}/{remote_key}")
            return True
        except Exception as e:
            logger.warning(f"OSS delete failed: {self.bucket}/{remote_key}, {e}")
            return False

    def test_connection(self) -> dict:
        try:
            info = self._bucket.get_bucket_info()
            return {
                'success': True,
                'message': '连接成功',
                'bucket': info.name,
                'region': info.location,
            }
        except self._oss2.exceptions.NoSuchBucket:
            return {'success': False, 'message': f'Bucket "{self.bucket}" 不存在'}
        except self._oss2.exceptions.AccessDenied:
            return {'success': False, 'message': '访问被拒绝，请检查权限或 RAM 策略'}
        except self._oss2.exceptions.AuthServerError:
            return {'success': False, 'message': '认证失败，请检查 AccessKey / SecretKey'}
        except Exception as e:
            return {'success': False, 'message': f'连接错误: {e}'}


_BACKEND_MAP = {
    's3': S3Backend,
    'oss': OSSBackend,
}


def get_backend(config: dict) -> StorageBackend:
    """工厂函数：根据 storage_type 返回对应后端实例"""
    storage_type = config.get('storage_type', 's3')
    backend_cls = _BACKEND_MAP.get(storage_type)
    if not backend_cls:
        raise ValueError(f"Unsupported storage type: {storage_type}")
    return backend_cls(config)


def build_config_from_model(storage_config) -> dict:
    """从 StorageConfig 模型构建配置字典"""
    extra = {}
    if storage_config.extra:
        try:
            extra = json.loads(storage_config.extra)
        except (json.JSONDecodeError, TypeError):
            pass
    return {
        'storage_type': storage_config.storage_type,
        'endpoint_url': storage_config.endpoint_url,
        'access_key': storage_config.access_key,
        'secret_key': storage_config.secret_key,
        'region': storage_config.region,
        'bucket': storage_config.bucket,
        'prefix': storage_config.prefix,
        'extra': extra,
    }


def upload_to_remote(config: dict, local_path: str) -> Tuple[str, str]:
    return get_backend(config).upload(local_path)


def download_from_remote(config: dict, remote_key: str, local_path: str) -> str:
    return get_backend(config).download(remote_key, local_path)


def delete_from_remote(config: dict, remote_key: str) -> bool:
    return get_backend(config).delete(remote_key)


def test_connection(config: dict) -> dict:
    return get_backend(config).test_connection()
