#from django.test import TestCase

# Create your tests here.
from .utils import test_connection_redis


data=test_connection_redis("192.168.1.250",6739)
print(data)


