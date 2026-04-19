const sharp = require('sharp');
sharp('/Users/karmansingh/Desktop/work/inv_gursimran_good/admin/public/rkm-logo.png')
  .trim()
  .toFile('/Users/karmansingh/Desktop/work/inv_gursimran_good/admin/public/rkm-logo-cropped.png')
  .then(info => console.log('Successfully cropped:', info))
  .catch(err => console.error('Error cropping:', err));
