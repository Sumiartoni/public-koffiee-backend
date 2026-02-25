import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serviceAccountPath = path.join(__dirname, '../config/firebase-service-account.json');

let firebaseApp = null;

if (fs.existsSync(serviceAccountPath)) {
    try {
        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
        firebaseApp = admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log('[FIREBASE] Admin SDK initialized successfully.');
    } catch (error) {
        console.error('[FIREBASE] Error initializing Admin SDK:', error.message);
    }
} else {
    console.warn('[FIREBASE] Service account file not found at:', serviceAccountPath);
    console.warn('[FIREBASE] Push notifications will be disabled.');
}

/**
 * Send push notification to a specific user
 * @param {number} userId 
 * @param {string} title 
 * @param {string} body 
 * @param {object} data Optional data payload
 */
export async function sendPush(userId, title, body, data = {}) {
    if (!firebaseApp) return;

    try {
        // Import db dynamically to avoid circular dependencies if any
        const { default: db } = await import('../db.js');

        // Get all tokens for this user
        const tokens = await db.all('SELECT token FROM fcm_tokens WHERE user_id = $1', [userId]);

        if (!tokens || tokens.length === 0) {
            console.log(`[FIREBASE] No tokens found for user ${userId}`);
            return;
        }

        const registrationTokens = tokens.map(t => t.token);

        const message = {
            notification: { title, body },
            data: {
                ...data,
                click_action: 'FLUTTER_NOTIFICATION_CLICK'
            },
            tokens: registrationTokens
        };

        const response = await admin.messaging().sendEachForMulticast(message);
        console.log(`[FIREBASE] Sent to user ${userId}: ${response.successCount} success, ${response.failureCount} failure`);

        // Cleanup invalid tokens
        if (response.failureCount > 0) {
            response.responses.forEach(async (resp, idx) => {
                if (!resp.success) {
                    const error = resp.error;
                    if (error.code === 'messaging/invalid-registration-token' ||
                        error.code === 'messaging/registration-token-not-registered') {
                        const invalidToken = registrationTokens[idx];
                        await db.run('DELETE FROM fcm_tokens WHERE token = $1', [invalidToken]);
                        console.log(`[FIREBASE] Removed invalid token for user ${userId}`);
                    }
                }
            });
        }
    } catch (error) {
        console.error('[FIREBASE] Error sending push:', error.message);
    }
}

/**
 * Broadcast notification to all users
 */
export async function broadcastPush(title, body, data = {}) {
    if (!firebaseApp) return;

    try {
        const { default: db } = await import('../db.js');
        const tokens = await db.all('SELECT token FROM fcm_tokens');

        if (tokens.length === 0) return;

        // FCM multicast limit is 500 per batch
        const registrationTokens = tokens.map(t => t.token);

        for (let i = 0; i < registrationTokens.length; i += 500) {
            const batch = registrationTokens.slice(i, i + 500);
            const message = {
                notification: { title, body },
                data: data,
                tokens: batch
            };
            await admin.messaging().sendEachForMulticast(message);
        }
        console.log(`[FIREBASE] Broadcasted to ${tokens.length} tokens.`);
    } catch (error) {
        console.error('[FIREBASE] Error broadcasting push:', error.message);
    }
}
