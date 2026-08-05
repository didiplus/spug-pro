# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
"""
字段级加密工具，基于 cryptography Fernet 对称加密。

特性:
1. 透明加解密: 写入时自动加密，读取时自动解密
2. 向后兼容: 旧明文数据（无 enc: 前缀）原样返回，不报错
3. 密钥派生: 从 Django SECRET_KEY 派生 Fernet 密钥，无需额外配置
4. 前缀标识: 加密数据以 'enc:' 前缀标识，便于区分新旧数据

用法 (模型字段):
    from libs.crypto import EncryptedTextField

    class Host(models.Model):
        pkey = EncryptedTextField(null=True)

手动加解密:
    from libs.crypto import encrypt, decrypt
    cipher = encrypt('my-secret')
    plain = decrypt(cipher)
"""
from django.conf import settings
from cryptography.fernet import Fernet
import base64
import hashlib

_ENCRYPT_PREFIX = 'enc:'
_fernet_instance = None


def _get_fernet():
    global _fernet_instance
    if _fernet_instance is None:
        key_material = settings.SECRET_KEY.encode('utf-8')
        derived = hashlib.sha256(key_material).digest()
        fernet_key = base64.urlsafe_b64encode(derived)
        _fernet_instance = Fernet(fernet_key)
    return _fernet_instance


def encrypt(value):
    """加密明文字符串，返回 'enc:<cipher>' 格式"""
    if value is None:
        return None
    if isinstance(value, str) and value.startswith(_ENCRYPT_PREFIX):
        return value
    token = _get_fernet().encrypt(value.encode('utf-8'))
    return _ENCRYPT_PREFIX + token.decode('utf-8')


def decrypt(value):
    """解密 'enc:<cipher>' 格式，旧明文原样返回"""
    if value is None:
        return None
    if isinstance(value, str) and value.startswith(_ENCRYPT_PREFIX):
        cipher = value[len(_ENCRYPT_PREFIX):]
        return _get_fernet().decrypt(cipher.encode('utf-8')).decode('utf-8')
    return value


def is_encrypted(value):
    """判断值是否已加密"""
    return value is not None and isinstance(value, str) and value.startswith(_ENCRYPT_PREFIX)