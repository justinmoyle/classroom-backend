import fetch from 'node-fetch';

async function main() {
  const res = await fetch('http://localhost:8000/api/departments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: 'CSC',
      name: 'Computer Science',
      description: 'Focuses on the theory, design, and application of computing technologies. This department prepares students to solve complex problems through software development, artificial intelligence, and cybersecurity while exploring the innovation process that transforms technical ideas into real-world products.'
    }),
  });
  const text = await res.text();
  console.log('Status:', res.status);
  console.log('Body:', text);
}

main().catch(e => { console.error(e); process.exit(1); });
