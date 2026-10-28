declare namespace NodeJS {
  interface ProcessEnv {
    NEXT_PUBLIC_API_URL?: string;
    NEXT_PUBLIC_APP_ENV?: string;
    NODE_ENV?: 'development' | 'production' | 'test';
  }
}
