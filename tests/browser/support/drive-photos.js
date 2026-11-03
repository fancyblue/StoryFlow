// A stand-in for the writer's Google Drive: the Picker returns these files and each reads as a
// small generated image. No real photo, credential or network request is involved.
export async function standInForDrivePhotos(page, files = [
  { driveFileId: 'drive-photo-1', name: 'IMG_0412.jpg', mimeType: 'image/jpeg', width: 1200, height: 800, takenAt: '2023-07-14T20:05:00' },
  { driveFileId: 'drive-photo-2', name: 'IMG_0418.jpg', mimeType: 'image/jpeg', width: 1200, height: 800, takenAt: '2023-07-14T21:10:00' },
  { driveFileId: 'drive-photo-3', name: 'IMG_0501.png', mimeType: 'image/png', width: 800, height: 800, takenAt: '2023-07-15T09:00:00' }
]) {
  await page.evaluate(list => {
    const colours = ['#4b4557', '#59703f', '#8a6526', '#a8443a'];
    window.__drivePicks = list;
    window.__driveReads = [];
    window.__driveMissing = new Set();
    window.__driveSignedOut = new Set();
    StoryFlowIntegrations.pickDrivePhotos = async () => window.__drivePicks.map(file => ({ ...file }));
    StoryFlowIntegrations.fetchDrivePhoto = async fileId => {
      window.__driveReads.push(fileId);
      if (window.__driveSignedOut.has(fileId)) {
        const error = new Error('登入 Google 後顯示照片');
        error.code = 'GOOGLE_SIGNED_OUT';
        throw error;
      }
      if (window.__driveMissing.has(fileId)) {
        const error = new Error('Google Drive 上找不到這張照片');
        error.status = 404;
        throw error;
      }
      const canvas = new OffscreenCanvas(120, 80);
      const context = canvas.getContext('2d');
      context.fillStyle = colours[Math.abs([...fileId].reduce((sum, char) => sum + char.charCodeAt(0), 0)) % colours.length];
      context.fillRect(0, 0, 120, 80);
      return canvas.convertToBlob({ type: 'image/png' });
    };
    StoryFlowIntegrations.saveVisualEntry = async payload => `StoryFlow-test/Works/${payload.projectTitle}/Visual/${payload.entry.id}`;
  }, files);
}
