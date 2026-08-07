# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
"""Ansible Vault 加密/解密工具"""
from apps.setting.utils import AppSetting
from libs.crypto import decrypt as spug_decrypt
import subprocess
import tempfile
import secrets
import os
import logging

logger = logging.getLogger(__name__)


def generate_vault_password() -> str:
    """生成随机 Vault 密码"""
    return secrets.token_urlsafe(32)


def get_vault_password() -> str:
    """从系统配置获取 Vault 密码（解密后的明文）"""
    raw = AppSetting.get_default('ansible_vault_password')
    if not raw:
        return None
    try:
        return spug_decrypt(raw)
    except Exception as e:
        logger.warning(f'Vault 密码解密失败: {e}')
        return None


def get_vault_password_file(tmpdir: str) -> str:
    """
    生成 vault password 文件供 ansible-runner 使用
    返回文件路径，如果没有配置 vault 密码则返回 None
    """
    vp = get_vault_password()
    if not vp:
        return None
    vp_file = os.path.join(tmpdir, 'vault_password.txt')
    with open(vp_file, 'w') as f:
        f.write(vp)
    os.chmod(vp_file, 0o600)
    return vp_file


def encrypt_value(value: str, vault_password: str = None, vault_id: str = "default") -> str:
    """
    使用 ansible-vault 加密值
    - value: 明文值
    - vault_password: Vault 密码，如果未指定则从配置读取
    - vault_id: Vault ID 标签
    返回加密后的字符串（包含 $ANSIBLE_VAULT 标识）
    """
    if vault_password is None:
        vault_password = get_vault_password()
    if not vault_password:
        raise ValueError('未配置 Vault 密码')

    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as vp_file:
        vp_file.write(vault_password)
        vp_path = vp_file.name
    os.chmod(vp_path, 0o600)

    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as plain_file:
        plain_file.write(value)
        plain_path = plain_file.name

    try:
        cmd = ['ansible-vault', 'encrypt', '--vault-password-file', vp_path]
        if vault_id and vault_id != 'default':
            cmd.extend(['--encrypt-vault-id', vault_id])
        cmd.append(plain_path)

        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30
        )
        if result.returncode != 0:
            raise RuntimeError(f'ansible-vault encrypt 失败: {result.stderr.decode()}')

        with open(plain_path, 'r') as f:
            encrypted = f.read()
        return encrypted.strip()
    except FileNotFoundError:
        raise RuntimeError('ansible-vault 未安装，请执行 pip install ansible 后重试')
    finally:
        os.unlink(vp_path)
        os.unlink(plain_path)


def decrypt_value(encrypted: str, vault_password: str = None) -> str:
    """
    使用 ansible-vault 解密值
    - encrypted: 加密字符串（包含 $ANSIBLE_VAULT 标识）
    - vault_password: Vault 密码，如果未指定则从配置读取
    返回解密后的明文
    """
    if vault_password is None:
        vault_password = get_vault_password()
    if not vault_password:
        raise ValueError('未配置 Vault 密码')

    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as vp_file:
        vp_file.write(vault_password)
        vp_path = vp_file.name
    os.chmod(vp_path, 0o600)

    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as enc_file:
        enc_file.write(encrypted)
        enc_path = enc_file.name

    try:
        result = subprocess.run(
            ['ansible-vault', 'decrypt', '--vault-password-file', vp_path, enc_path],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30
        )
        if result.returncode != 0:
            raise RuntimeError(f'ansible-vault decrypt 失败: {result.stderr.decode()}')

        with open(enc_path, 'r') as f:
            plain = f.read()
        return plain.strip()
    except FileNotFoundError:
        raise RuntimeError('ansible-vault 未安装，请执行 pip install ansible 后重试')
    finally:
        os.unlink(vp_path)
        os.unlink(enc_path)


def encrypt_string(value: str, key: str, vault_password: str = None) -> str:
    """
    使用 ansible-vault encrypt_string 生成内联加密变量
    - value: 明文值
    - key: 变量名
    返回 'key: !vault |\n  $ANSIBLE_VAULT;...' 格式的字符串
    """
    if vault_password is None:
        vault_password = get_vault_password()
    if not vault_password:
        raise ValueError('未配置 Vault 密码')

    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as vp_file:
        vp_file.write(vault_password)
        vp_path = vp_file.name
    os.chmod(vp_path, 0o600)

    try:
        result = subprocess.run(
            ['ansible-vault', 'encrypt_string', '--vault-password-file', vp_path, value, '--name', key],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30
        )
        if result.returncode != 0:
            raise RuntimeError(f'ansible-vault encrypt_string 失败: {result.stderr.decode()}')

        return result.stdout.decode().strip()
    except FileNotFoundError:
        raise RuntimeError('ansible-vault 未安装，请执行 pip install ansible 后重试')
    finally:
        os.unlink(vp_path)