import { buildApp } from './server/app';

async function main() {
  const app = buildApp();
  await app.ready();

  console.log('--- Registering User ---');
  const registerResponse = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      username: 'testuser',
      password: 'testpassword'
    }
  });

  console.log('Status Code:', registerResponse.statusCode);
  console.log('Response Body:', registerResponse.body);

  if (registerResponse.statusCode !== 201) {
    console.log('Failed to register user');
    return;
  }

  const { token } = JSON.parse(registerResponse.body);

  console.log('\n--- Creating Game ---');
  const gameResponse = await app.inject({
    method: 'POST',
    url: '/games',
    headers: {
      authorization: `Bearer ${token}`
    },
    payload: {
      scenarioId: 'swamp-siege-01',
      role: 'onion'
    }
  });

  console.log('Status Code:', gameResponse.statusCode);
  console.log('Response Body:', gameResponse.body);

  if (gameResponse.statusCode !== 201) {
    const errorBody = JSON.parse(gameResponse.body);
    console.log('\nFAILURE REASON:', errorBody.error || errorBody.message || 'Unknown error');
  }

  await app.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
