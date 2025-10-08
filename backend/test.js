const fetch = require("node-fetch");

const KEYCLOAK_URL = "http://localhost:8080/realms/myrealm/protocol/openid-connect/token";
const CLIENT_ID = "my_django_client";
const USERNAME = "testuser";
const PASSWORD = "test";

async function getToken() {
  const res = await fetch(KEYCLOAK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      username: USERNAME,
      password: PASSWORD,
      grant_type: "password",
      scope: "openid profile email",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data.access_token;
}

async function callApi() {
  const token = await getToken(); // ✅ Always fetches a fresh token

  const res = await fetch("http://localhost:8000/api/describe/?query=Paris", {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json();
  console.log(data);
}

callApi().catch(console.error);
