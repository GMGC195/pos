const { google } = require('googleapis');
const axios = require('axios');

/**
 * Uploads an image from a Cloudinary URL to a month-wise folder in Google Drive.
 *
 * @param {string} imageUrl The URL of the image (e.g. from Cloudinary)
 * @param {string} invoiceNumber The invoice number for naming the file
 */
async function backupImageToDrive(imageUrl, invoiceNumber) {
  try {
    const { GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_DRIVE_ROOT_FOLDER_ID } = process.env;

    if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY || !GOOGLE_DRIVE_ROOT_FOLDER_ID) {
      console.log('⚠️ Google Drive API credentials missing in .env. Skipping backup.');
      return;
    }

    const auth = new google.auth.JWT(
      GOOGLE_SERVICE_ACCOUNT_EMAIL,
      null,
      GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive']
    );

    const drive = google.drive({ version: 'v3', auth });

    // 1. Get current month name / format (e.g., "2026-08")
    const date = new Date();
    const monthFolder = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    // 2. Check if this folder already exists in the root folder
    let targetFolderId = null;
    const resFolder = await drive.files.list({
      q: `mimeType='application/vnd.google-apps.folder' and name='${monthFolder}' and '${GOOGLE_DRIVE_ROOT_FOLDER_ID}' in parents and trashed=false`,
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    if (resFolder.data.files.length > 0) {
      targetFolderId = resFolder.data.files[0].id;
    } else {
      // 3. Create the folder if it doesn't exist
      const folderMetadata = {
        name: monthFolder,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [GOOGLE_DRIVE_ROOT_FOLDER_ID],
      };
      const createdFolder = await drive.files.create({
        resource: folderMetadata,
        fields: 'id',
      });
      targetFolderId = createdFolder.data.id;
    }

    // 4. Download image from Cloudinary
    const imageRes = await axios.get(imageUrl, { responseType: 'stream' });
    
    // 5. Build File Name: [Invoice_Number]_[Date]_[Time]
    const dateStr = date.toISOString().split('T')[0];
    const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, '-');
    const fileName = `${invoiceNumber}_${dateStr}_${timeStr}.jpg`;

    // 6. Upload to Google Drive
    const fileMetadata = {
      name: fileName,
      parents: [targetFolderId],
    };
    const media = {
      mimeType: imageRes.headers['content-type'],
      body: imageRes.data,
    };

    const uploadedFile = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, name',
    });

    console.log(`✅ Image successfully backed up to Google Drive. File ID: ${uploadedFile.data.id}, Name: ${uploadedFile.data.name}`);
    return uploadedFile.data;

  } catch (error) {
    console.error('❌ Error backing up image to Google Drive:', error.message);
  }
}

module.exports = { backupImageToDrive };
