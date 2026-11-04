# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
"""
加密模型字段，写入时自动加密，读取时自动解密，兼容旧明文数据。
"""
from django.db import models
from .crypto import encrypt, decrypt
import logging

logger = logging.getLogger(__name__)


class EncryptedTextField(models.TextField):
    """加密文本字段，基于 Fernet 对称加密"""

    def get_prep_value(self, value):
        if value is None:
            return None
        return encrypt(value)

    def from_db_value(self, value, expression, connection):
        if value is None:
            return None
        try:
            return decrypt(value)
        except Exception:
            logger.warning("字段解密异常，已返回空字符串", exc_info=True)
            return ''

    def to_python(self, value):
        if value is None:
            return None
        try:
            return decrypt(value)
        except Exception:
            logger.warning("字段解密异常，已返回空字符串", exc_info=True)
            return ''