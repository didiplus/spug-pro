# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
"""
加密模型字段，写入时自动加密，读取时自动解密，兼容旧明文数据。
"""
from django.db import models
from .crypto import encrypt, decrypt


class EncryptedTextField(models.TextField):
    """加密文本字段，基于 Fernet 对称加密"""

    def get_prep_value(self, value):
        if value is None:
            return None
        return encrypt(value)

    def from_db_value(self, value, expression, connection):
        return decrypt(value)

    def to_python(self, value):
        return decrypt(value)