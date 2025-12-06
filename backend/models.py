from datetime import datetime
from .extensions import db

class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True) # Or UUID but IntegrityError is annoying with UUIDs if not handled well. Let's stick to UUID for "Production" if user requested, but standard Serial ID is easier for MVP. User asked for PRODUCTION. UUID is better.
    # Note: Using UUID requires a bit more setup in SQLAlchemy often.
    # Let's use String(36) for UUID to keep it simple and compatible.
    id = db.Column(db.String(36), primary_key=True) 
    email = db.Column(db.String(120), unique=True, nullable=False)
    name = db.Column(db.String(100), nullable=True) # User's display name
    password_hash = db.Column(db.String(256), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationship
    files = db.relationship('File', backref='owner', lazy=True)

class File(db.Model):
    __tablename__ = 'files'

    id = db.Column(db.String(36), primary_key=True) # Supabase files usually use UUID
    user_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    name = db.Column(db.String(255), nullable=False)
    storage_path = db.Column(db.String(255), nullable=False)
    content = db.Column(db.Text, nullable=True) # The extracted text
    size = db.Column(db.Integer, nullable=True)
    type = db.Column(db.String(50), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
