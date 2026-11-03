const admin = require('firebase-admin');

// تهيئة Firebase Admin مرة واحدة فقط
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Vercel بيخزن الـ private key كنص — نحوّل \n لسطر حقيقي
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // التحقق من الـ Authorization header (Secret key بسيط)
  const authHeader = req.headers['authorization'] || '';
  if (authHeader !== `Bearer ${process.env.SERVER_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { recipientUid, title, body, data = {} } = req.body;

  if (!recipientUid || !title || !body) {
    return res.status(400).json({
      error: 'Missing required fields: recipientUid, title, body',
    });
  }

  try {
    // جلب FCM token المستخدم من Firestore
    const userDoc = await db.collection('users').doc(recipientUid).get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const fcmToken = userDoc.data()?.fcmToken;

    if (!fcmToken) {
      return res.status(200).json({
        success: false,
        message: 'User has no FCM token (app not opened yet)',
      });
    }

    // إرسال الإشعار
    const message = {
      token: fcmToken,
      notification: { title, body },
      data: {
        ...data,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'loop_messages',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    };

    const response = await admin.messaging().send(message);
    console.log('Notification sent:', response);

    return res.status(200).json({
      success: true,
      messageId: response,
    });
  } catch (error) {
    console.error('Error sending notification:', error);

    // لو الـ token قديم أو غلط نمسحه من Firestore
    if (
      error.code === 'messaging/invalid-registration-token' ||
      error.code === 'messaging/registration-token-not-registered'
    ) {
      await db.collection('users').doc(recipientUid).update({ fcmToken: null });
    }

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
