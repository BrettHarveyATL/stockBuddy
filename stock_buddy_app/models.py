from django.db import models
from django.db.models.fields import DateField
import re

class UserManger(models.Manager):
    def basic_validator(self, post_data):
        errors = {}
        if len(post_data['first_name']) < 2:
            errors["first_name"] = "Name should be at least 2 characters"
        if len(post_data['last_name']) < 3:
            errors["last_name"] = "Name should be at least 2 characters"
        if len(post_data['email']) < 10:
            errors["email"] = "email should be name should be at least 10 characters"
        EMAIL_REGEX = re.compile(r'^[a-zA-Z0-9.+_-]+@[a-zA-Z0-9._-]+\.[a-zA-z]+$')
        if not EMAIL_REGEX.match(post_data['email']):
            errors['email'] = "Must include a valid email"
        if len(post_data['password']) > 64 or len(post_data['password']) < 8:
            errors["password"] = "Password should be at least 8 characters an"
        if post_data['confirm_password'] != post_data['password']:
            errors["password"] = "Passwords do not match"
        user = User.objects.filter(email=post_data['email'])
        if user:
            errors["email"] = "Email is already used."
        
        return errors

class User(models.Model):
    first_name = models.CharField(max_length=50)
    last_name = models.CharField(max_length=50)
    email = models.CharField(max_length=200)
    password= models.CharField(max_length=150)
    balance = models.IntegerField()
    #positions
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    objects = UserManger()

class Position(models.Model):
    stock = models.CharField(max_length=50)
    num_shares = models.IntegerField()
    bought_at = models.FloatField()
    owned_by = models.ForeignKey(User, related_name="positions", on_delete=models.CASCADE)
    market_price = models.FloatField(null=True)
    bid_price = models.FloatField(null=True)
    ask_price = models.FloatField(null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)