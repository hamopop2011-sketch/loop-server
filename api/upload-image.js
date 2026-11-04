const FormData = require('form-data');
const fetch    = require('node-fetch');

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  // Authorization
  const authHeader = req.headers['authorization'] || '';
  if (authHeader !== `Bearer ${process.env.SERVER_SECRET}`)
    return res.status(401).json({ error: 'Unauthorized' });

  const { imageBase64, fileName, uid } = req.body;

  if (!imageBase64 || !fileName || !uid)
    return res.status(400).json({
      error: 'Missing required fields: imageBase64, fileName, uid',
    });

  try {
    // تحويل Base64 إلى Buffer
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');

    // رفع الصورة على ImageKit
    const form = new FormData();
    form.append('file',        imageBuffer, { filename: fileName, contentType: 'image/jpeg' });
    form.append('fileName',    fileName);
    form.append('folder',      `/avatars/${uid}`);   // مجلد منفصل لكل مستخدم
    form.append('useUniqueFileName', 'true');
    form.append('tags',        'avatar,user');

    // ImageKit Upload API — المصادقة بالـ Private Key
    const privateKey   = process.env.IMAGEKIT_PRIVATE_KEY;
    const credentials  = Buffer.from(`${privateKey}:`).toString('base64');

    const response = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
      method : 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        ...form.getHeaders(),
      },
      body: form,
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('ImageKit error:', result);
      return res.status(500).json({ error: result.message || 'Upload failed' });
    }

    // نرجع الـ URL الجاهز للاستخدام
    return res.status(200).json({
      success : true,
      url     : result.url,           // الرابط الكامل
      fileId  : result.fileId,        // للحذف لاحقاً لو احتجنا
      filePath: result.filePath,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: error.message });
  }
};
