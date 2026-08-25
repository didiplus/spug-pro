import os
import logging
from typing import Optional, Tuple

try:
    import boto3
    from botocore.exceptions import ClientError, NoCredentialsError
except ImportError:
    boto3 = None
    ClientError = Exception
    NoCredentialsError = Exception

logger = logging.getLogger(__name__)


def _get_s3_client(config):
    if boto3 is None:
        raise ImportError("boto3 is not installed, run: pip install boto3")

    return boto3.client(
        's3',
        endpoint_url=config.get('endpoint_url') or None,
        aws_access_key_id=config.get('access_key'),
        aws_secret_access_key=config.get('secret_key'),
        region_name=config.get('region') or None,
    )


def _get_remote_key(config, filename):
    prefix = (config.get('prefix') or '').strip('/')
    if prefix:
        return f"{prefix}/{filename}"
    return filename


def upload_to_s3(config, local_path: str) -> Tuple[str, str]:
    if not os.path.exists(local_path):
        raise FileNotFoundError(f"Local file not found: {local_path}")

    filename = os.path.basename(local_path)
    remote_key = _get_remote_key(config, filename)
    bucket = config.get('bucket')
    if not bucket:
        raise ValueError("S3 bucket name is required")

    client = _get_s3_client(config)
    file_size = os.path.getsize(local_path)

    extra_args = {}
    content_type = 'application/octet-stream'
    if filename.endswith('.gz') or filename.endswith('.tgz'):
        content_type = 'application/gzip'
    elif filename.endswith('.sql'):
        content_type = 'text/plain'
    extra_args['ContentType'] = content_type

    client.upload_file(local_path, bucket, remote_key, ExtraArgs=extra_args)
    logger.info(f"S3 upload success: {bucket}/{remote_key} ({file_size} bytes)")
    return remote_key, f"s3://{bucket}/{remote_key}"


def download_from_s3(config, remote_key: str, local_path: str) -> str:
    bucket = config.get('bucket')
    if not bucket:
        raise ValueError("S3 bucket name is required")

    client = _get_s3_client(config)
    client.download_file(bucket, remote_key, local_path)
    logger.info(f"S3 download success: {bucket}/{remote_key} -> {local_path}")
    return local_path


def delete_from_s3(config, remote_key: str) -> bool:
    bucket = config.get('bucket')
    if not bucket:
        raise ValueError("S3 bucket name is required")

    client = _get_s3_client(config)
    try:
        client.delete_object(Bucket=bucket, Key=remote_key)
        logger.info(f"S3 delete success: {bucket}/{remote_key}")
        return True
    except Exception as e:
        logger.warning(f"S3 delete failed: {bucket}/{remote_key}, error: {e}")
        return False


def test_s3_connection(config) -> dict:
    try:
        client = _get_s3_client(config)
        bucket = config.get('bucket')
        if not bucket:
            return {'success': False, 'message': 'Bucket name is required'}

        client.head_bucket(Bucket=bucket)
        location = client.get_bucket_location(Bucket=bucket)
        region = location.get('LocationConstraint') or 'us-east-1'

        return {
            'success': True,
            'message': 'Connection successful',
            'bucket': bucket,
            'region': region,
            'endpoint': config.get('endpoint_url') or 'AWS default',
        }
    except NoCredentialsError:
        return {'success': False, 'message': 'Invalid credentials'}
    except ClientError as e:
        error_code = e.response.get('Error', {}).get('Code', 'Unknown')
        if error_code == '404':
            return {'success': False, 'message': f'Bucket "{bucket}" not found'}
        elif error_code == '403':
            return {'success': False, 'message': 'Access denied to bucket'}
        return {'success': False, 'message': f'S3 error: {str(e)}'}
    except Exception as e:
        return {'success': False, 'message': f'Connection error: {str(e)}'}


def build_config_from_model(storage_config) -> dict:
    return {
        'endpoint_url': storage_config.endpoint_url,
        'access_key': storage_config.access_key,
        'secret_key': storage_config.secret_key,
        'region': storage_config.region,
        'bucket': storage_config.bucket,
        'prefix': storage_config.prefix,
    }