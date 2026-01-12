/// <reference types="react-scripts" />

// ✅ Apple Sign In SDK types
declare global {
  interface Window {
    AppleID?: {
      auth: {
        init: (config: {
          clientId: string;
          scope: string;
          redirectURI: string;
          usePopup: boolean;
        }) => void;
        signIn: (config: {
          requestedScopes: string[];
        }) => Promise<{
          id_token: string;
          code: string;
          user?: {
            name?: {
              firstName?: string;
              lastName?: string;
            };
            email?: string;
          };
        }>;
      };
    };
  }
}

export {};