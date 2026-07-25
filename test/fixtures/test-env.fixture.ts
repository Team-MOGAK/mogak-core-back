process.env.NODE_ENV = 'test';
process.env.PORT = '8081';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/mogak_test';
process.env.JWT_SECRET = 'test-jwt-secret-with-at-least-thirty-two-characters';
process.env.APPLE_CLIENT_IDS = 'com.mogak.ios';
process.env.GOOGLE_CLIENT_IDS = 'mogak-web-client';
