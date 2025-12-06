from extensions import db
from models import User
from flask import Flask
from decouple import config

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = config('DB_CONNECTION_STRING', default=config('DATABASE_URL'))
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db.init_app(app)

def check_users():
    with app.app_context():
        print("Checking users in DB...")
        try:
            users = User.query.all()
            print(f"Found {len(users)} users.")
            for u in users:
                print(f"User: id={u.id}, email={u.email}")
                
            # Check specifically for the ID in the error
            target_id = "8885c1e5-d31f-4458-9ea8-aab8109f1306"
            u = User.query.get(target_id)
            if u:
                print(f"Target user {target_id} FOUND.")
            else:
                print(f"Target user {target_id} NOT FOUND.")
        except Exception as e:
            print(f"Error querying DB: {e}")

if __name__ == "__main__":
    check_users()
