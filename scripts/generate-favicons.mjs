import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';

const sizes = [
  { name: 'favicon-16x16.png', size: 16 },
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'favicon-64x64.png', size: 64 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'android-chrome-192x192.png', size: 192 },
  { name: 'android-chrome-512x512.png', size: 512 },
];

async function generateFavicons() {
  const svgPath = path.join(process.cwd(), 'public', 'parking.svg');
  const outputDir = path.join(process.cwd(), 'public');

  console.log('🚗 Generating favicons from parking.svg...\n');

  for (const { name, size } of sizes) {
    const outputPath = path.join(outputDir, name);
    
    await sharp(svgPath)
      .resize(size, size)
      .png()
      .toFile(outputPath);
    
    console.log(`✅ Generated ${name} (${size}x${size})`);
  }

  // Generate favicon.ico (multi-size .ico file)
  const icoPath = path.join(outputDir, 'favicon.ico');
  await sharp(svgPath)
    .resize(32, 32)
    .png()
    .toFile(icoPath.replace('.ico', '-temp.png'));
  
  // Rename temp file to .ico (sharp doesn't support .ico directly)
  await fs.rename(
    icoPath.replace('.ico', '-temp.png'),
    icoPath
  );
  
  console.log('✅ Generated favicon.ico (32x32)');
  console.log('\n✨ All favicons generated successfully!');
}

generateFavicons().catch(console.error);
