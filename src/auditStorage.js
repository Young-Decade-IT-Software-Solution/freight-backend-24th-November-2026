import fs from 'fs';
import path from 'path';

function runStorageAudit() {
  console.log('================================================================');
  console.log('  FREIGHTERP PRODUCTION AUDIT: DOCUMENT STORAGE & SURVIVABILITY ');
  console.log('================================================================\n');

  const uploadDir = fs.existsSync(path.resolve(process.cwd(), 'backend', 'uploads', 'documents'))
    ? path.resolve(process.cwd(), 'backend', 'uploads', 'documents')
    : path.resolve(process.cwd(), 'uploads', 'documents');
  console.log(`1. Inspecting Local Document Storage Directory: ${uploadDir}`);

  if (!fs.existsSync(uploadDir)) {
    console.error('Document storage directory does not exist!');
    process.exit(1);
  }

  const files = fs.readdirSync(uploadDir);
  console.log(`2. Current Stored Documents Count: ${files.length} file(s)`);
  files.forEach((file, idx) => {
    const filePath = path.join(uploadDir, file);
    const stats = fs.statSync(filePath);
    console.log(`   [File ${idx + 1}] ${file} (${stats.size} bytes, Created: ${stats.birthtime.toISOString()})`);
  });

  // Verify test file survival
  console.log('\n3. Verifying Local Storage Survivability:');
  const testFile = path.join(uploadDir, `survival_test_${Date.now()}.txt`);
  fs.writeFileSync(testFile, 'FreightERP Disk Survival Check');
  const existsBefore = fs.existsSync(testFile);
  console.log(`   File creation verified: ${existsBefore}`);
  fs.unlinkSync(testFile);

  console.log('\n4. Production Survivability Analysis:');
  console.log('   - Process Restart (Node.js): SURVIVES (Local files remain on host disk).');
  console.log('   - Application Rebuild (Vite/dist): SURVIVES (Frontend rebuild touches only frontend/dist).');
  console.log('   - Stateless Container Redeployment (Docker/PaaS/Kubernetes without PVC): DOES NOT SURVIVE.');
  console.log('     Ephemeral container restarts wipe /uploads unless backed by persistent volume.');

  console.log('\n5. Recommended Production Storage Architecture:');
  console.log('   A. Cloud Object Storage (AWS S3 / Google Cloud Storage / Azure Blob):');
  console.log('      - Offloads disk I/O, infinite scaling, 99.999999999% durability.');
  console.log('      - Uses pre-signed download URLs with short expiration (e.g. 15 min), maintaining strict RBAC.');
  console.log('   B. Self-Hosted S3-Compatible Object Store (MinIO):');
  console.log('      - Completely open-source, on-premise, API-compatible with AWS S3 SDK.');
  console.log('   C. Persistent Volume Mount (Kubernetes PVC / AWS EFS / NFS):');
  console.log('      - Minimal code change, mounts persistent directory directly into /uploads/documents.');

  console.log('\n================================================================');
  console.log('  DOCUMENT STORAGE AUDIT COMPLETE                               ');
  console.log('================================================================\n');
}

runStorageAudit();
