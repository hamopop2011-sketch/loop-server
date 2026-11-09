const FormData = require('form-data');
const fetch    = require('node-fetch');
const admin    = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId  : process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey : (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  // التحقق من Firebase ID Token
  const authHeader = req.headers['authorization'] || '';
  if (!authHeader.startsWith('Bearer '))
    return res.status(401).json({ error: 'Missing Authorization header' });

  let uid;
  try {
    const decoded = await admin.auth().verifyIdToken(authHeader.slice(7));
    uid = decoded.uid;
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const { imageBase64, fileName } = req.body;
  if (!imageBase64 || !fileName)
    return res.status(400).json({ error: 'Missing imageBase64 or fileName' });

  try {
    const base64Data  = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');

    const form = new FormData();
    form.append('file',              imageBuffer, { filename: fileName, contentType: 'image/jpeg' });
    form.append('fileName',          fileName);
    form.append('folder',            `/statuses/${uid}`);
    form.append('useUniqueFileName', 'true');
    form.append('tags',              'status,user');

    const credentials = Buffer.from(`${process.env.IMAGEKIT_PRIVATE_KEY}:`).toString('base64');

    const response = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
      method : 'POST',
      headers: { Authorization: `Basic ${credentials}`, ...form.getHeaders() },
      body   : form,
    });

    const result = await response.json();
    if (!response.ok)
      return res.status(500).json({ error: result.message || 'Upload failed' });

    return res.status(200).json({ success: true, url: result.url, fileId: result.fileId });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
