#!/bin/bash

echo "==========================================="
echo "   FIX DATABASE PERMISSIONS (AAPanel)      "
echo "==========================================="
echo ""

# 1. Ask for Database Name
read -p "Masukkan Nama Database (contoh: koffie_db): " DBNAME

# 2. Ask for Database User
read -p "Masukkan Username Database (contoh: koffie_user): " DBUSER

echo ""
echo "Sedang memperbaiki permission untuk user '$DBUSER' di database '$DBNAME'..."
echo ""

# 3. Execute SQL commands using sudo -u postgres psql
# We use a heredoc to pass multiple commands
sudo -u postgres psql -d "$DBNAME" <<EOF
GRANT ALL PRIVILEGES ON TABLE customer_vouchers TO $DBUSER;
GRANT ALL PRIVILEGES ON SEQUENCE customer_vouchers_id_seq TO $DBUSER;

GRANT ALL PRIVILEGES ON TABLE notifications TO $DBUSER;
GRANT ALL PRIVILEGES ON SEQUENCE notifications_id_seq TO $DBUSER;

GRANT ALL PRIVILEGES ON TABLE user_notifications TO $DBUSER;
GRANT ALL PRIVILEGES ON SEQUENCE user_notifications_id_seq TO $DBUSER;

-- Permission tambahan untuk jaga-jaga
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $DBUSER;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $DBUSER;
EOF

echo ""
echo "✅ Selesai! Permission telah diperbaiki."
echo "Silahkan coba simpan voucher lagi di Backoffice."
