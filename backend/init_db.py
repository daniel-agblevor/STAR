from flask import Flask
from decouple import config
from extensions import db
from models import User, File

def init_db():
    app = Flask(__name__)
    
    # Load Config
    app.config['SQLALCHEMY_DATABASE_URI'] = config('DB_CONNECTION_STRING', default=config('DATABASE_URL')) 
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    db.init_app(app)

    with app.app_context():
        print("Creating all tables...")
        db.create_all()
        print("Tables created successfully!")

if __name__ == "__main__":
    init_db()
