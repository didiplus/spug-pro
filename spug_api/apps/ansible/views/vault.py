# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django.views.generic import View
from libs import json_response, JsonParser, Argument, human_datetime, auth
from apps.ansible.models import VaultSecret
from libs.crypto import encrypt, decrypt
import json


class VaultView(View):
    @auth('ansible.vault.view')
    def get(self, request):
        secrets = VaultSecret.objects.all()
        return json_response([s.to_view() for s in secrets])

    @auth('ansible.vault.edit')
    def post(self, request):
        form, error = JsonParser(
            Argument('id', type=int, required=False),
            Argument('name', help='请输入名称'),
            Argument('key', help='请输入变量名'),
            Argument('value', required=False),
            Argument('vault_id', default='default'),
            Argument('host_ids', type=list, default=[]),
            Argument('desc', required=False),
        ).parse(request.body)
        if error is None:
            host_ids_json = json.dumps(form.host_ids)
            if form.id:
                update_fields = dict(
                    name=form.name, key=form.key, vault_id=form.vault_id,
                    host_ids=host_ids_json, desc=form.desc, updated_at=human_datetime(),
                )
                if form.value:
                    update_fields['encrypted_value'] = encrypt(form.value)
                VaultSecret.objects.filter(pk=form.id).update(**update_fields)
            else:
                if not form.value:
                    return json_response(error='请输入变量值')
                VaultSecret.objects.create(
                    name=form.name, key=form.key, encrypted_value=encrypt(form.value),
                    vault_id=form.vault_id, host_ids=host_ids_json, desc=form.desc, created_by=request.user,
                )
        return json_response(error=error)

    @auth('ansible.vault.edit')
    def delete(self, request):
        form, error = JsonParser(
            Argument('id', type=int, help='请指定操作对象')
        ).parse(request.GET)
        if error is None:
            VaultSecret.objects.filter(pk=form.id).delete()
        return json_response(error=error)


class VaultDecryptView(View):
    @auth('ansible.vault.decrypt')
    def post(self, request):
        form, error = JsonParser(
            Argument('id', type=int, help='请指定 Vault 密钥'),
        ).parse(request.body)
        if error is None:
            secret = VaultSecret.objects.filter(pk=form.id).first()
            if not secret:
                return json_response(error='Vault 密钥不存在')
            try:
                value = decrypt(secret.encrypted_value)
                return json_response({'key': secret.key, 'value': value})
            except Exception as e:
                return json_response(error=f'解密失败: {e}')
        return json_response(error=error)