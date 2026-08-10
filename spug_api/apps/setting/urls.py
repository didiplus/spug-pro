# Copyright: (c) OpenSpug Organization. https://github.com/openspug/spug
# Copyright: (c) <spug.dev@gmail.com>
# Released under the AGPL-3.0 License.
from django.urls import re_path
from apps.setting.views import *
from apps.setting.user import UserSettingView
from apps.setting.views import MenuView, MenuManageView

urlpatterns = [
    re_path(r"^$", SettingView.as_view()),
    re_path(r"^user/$", UserSettingView.as_view()),
    re_path(r"^ldap_test/$", ldap_test),
    re_path(r"^email_test/$", email_test),
    re_path(r"^mfa/$", MFAView.as_view()),
    re_path(r"^about/$", get_about),
    re_path(r"^push/bind/$", handle_push_bind),
    re_path(r"^push/balance/$", handle_push_balance),
    re_path(r"^menus/$", MenuView.as_view()),
    re_path(r"^menus/manage/$", MenuManageView.as_view()),
]
