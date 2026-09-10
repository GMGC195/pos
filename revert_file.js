const { execSync } = require('child_process');
try {
  execSync('git checkout client/src/pages/AttendanceTracker.jsx', { stdio: 'inherit' });
  console.log('Successfully checked out file.');
} catch (e) {
  console.error('Failed to checkout file', e.message);
}
