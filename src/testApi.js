import http from 'http';

// Helper to make HTTP JSON requests
function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, text: body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function runTests() {
  console.log('--- Starting Backend API Integration Tests ---');
  const port = 5000;

  // 1. Health check
  console.log('Testing GET /api/health...');
  const healthRes = await request({
    hostname: '127.0.0.1',
    port,
    path: '/api/health',
    method: 'GET',
  });
  console.log(`Health Status: ${healthRes.status}, Body:`, healthRes.data);
  if (healthRes.status !== 200 || healthRes.data.status !== 'online') {
    throw new Error('Health check failed');
  }

  // 2. Login Super Admin
  console.log('\nTesting POST /api/auth/login (Super Admin)...');
  const loginRes = await request(
    {
      hostname: '127.0.0.1',
      port,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    {
      email: 'admin@freighterp.com',
      password: 'Freight123!',
    }
  );
  console.log(`Login Status: ${loginRes.status}, User: ${loginRes.data?.user?.name}, Role: ${loginRes.data?.user?.role}`);
  if (loginRes.status !== 200 || !loginRes.data.token) {
    throw new Error('Super Admin login failed');
  }
  const token = loginRes.data.token;

  // 3. Get Current User /api/auth/me
  console.log('\nTesting GET /api/auth/me...');
  const meRes = await request({
    hostname: '127.0.0.1',
    port,
    path: '/api/auth/me',
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(`Auth Me Status: ${meRes.status}, Email: ${meRes.data?.user?.email}`);
  if (meRes.status !== 200) throw new Error('/api/auth/me failed');

  // 4. Get Branches
  console.log('\nTesting GET /api/branches...');
  const branchesRes = await request({
    hostname: '127.0.0.1',
    port,
    path: '/api/branches',
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(`Branches Status: ${branchesRes.status}, Branch Count: ${branchesRes.data?.count}`);
  if (branchesRes.status !== 200 || branchesRes.data?.count < 5) {
    throw new Error('Branches count mismatch or API failed');
  }

  // 5. Get Users
  console.log('\nTesting GET /api/users...');
  const usersRes = await request({
    hostname: '127.0.0.1',
    port,
    path: '/api/users',
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(`Users Status: ${usersRes.status}, User Count: ${usersRes.data?.count}`);
  if (usersRes.status !== 200 || usersRes.data?.count < 15) {
    throw new Error('Users count mismatch or API failed');
  }

  // 6. Get Dashboard Stats
  console.log('\nTesting GET /api/dashboard...');
  const dashRes = await request({
    hostname: '127.0.0.1',
    port,
    path: '/api/dashboard',
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(`Dashboard Status: ${dashRes.status}, KPIs:`, dashRes.data?.data?.kpis);
  if (dashRes.status !== 200 || !dashRes.data?.data?.kpis) {
    throw new Error('Dashboard stats failed');
  }

  // 7. Test Branch-Scoped User Access (Login as Branch 2 Admin)
  console.log('\nTesting Branch-scoped user: manager.rotterdam@freighterp.com...');
  const b2LoginRes = await request(
    {
      hostname: '127.0.0.1',
      port,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    {
      email: 'manager.rotterdam@freighterp.com',
      password: 'Freight123!',
    }
  );
  const b2Token = b2LoginRes.data.token;
  const b2UsersRes = await request({
    hostname: '127.0.0.1',
    port,
    path: '/api/users',
    method: 'GET',
    headers: { Authorization: `Bearer ${b2Token}` },
  });
  console.log(`Branch 2 Admin users count (scoped): ${b2UsersRes.data?.count}`);

  console.log('\nALL 7 BACKEND API TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
