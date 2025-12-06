import os
import secrets
from flask import Flask
from decouple import config
from extensions import db
from sqlalchemy import text

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = config('DB_CONNECTION_STRING')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)

def migrate():
    with app.app_context():
        # Check if column exists, if not add it
        # Postgres specific
        try:
            with db.engine.connect() as conn:
                conn.execute(text("ALTER TABLE users ADD COLUMN name VARCHAR(100)"))
                conn.commit()
                print("Added column 'name' to users table.")
        except Exception as e:
            print(f"Migration error (column might exist): {e}")

if __name__ == "__main__":
    migrate()
