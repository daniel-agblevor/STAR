from flask import Flask
from decouple import config
from extensions import db
from sqlalchemy import text

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = config('DB_CONNECTION_STRING', default=config('DATABASE_URL'))
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)

def migrate():
    with app.app_context():
        try:
            with db.engine.connect() as conn:
                # Alter "type" column size to 255
                conn.execute(text("ALTER TABLE files ALTER COLUMN type TYPE VARCHAR(255)"))
                # Just in case, alter name and storage_path too if needed, but 255 is usually fine for filenames.
                # But let's verify storage_path.
                conn.execute(text("ALTER TABLE files ALTER COLUMN storage_path TYPE VARCHAR(512)"))
                conn.commit()
                print("Migration successful: Increased 'type' and 'storage_path' column limits.")
        except Exception as e:
            print(f"Migration error: {e}")

if __name__ == "__main__":
    migrate()
