/**
 * Utility functions for Nimbus
 */

/**
 * Simple console logging utilities
 */
export const logger = {
  info: (message: string) => {
    console.log(message);
  },
  
  success: (message: string) => {
    console.log('[SUCCESS] ' + message);
  },
  
  warning: (message: string) => {
    console.log('[WARNING] ' + message);
  },
  
  error: (message: string) => {
    console.log('[ERROR] ' + message);
  },
  
  deploy: (message: string) => {
    console.log('[DEPLOY] ' + message);
  },
  
  destroy: (message: string) => {
    console.log('[DESTROY] ' + message);
  }
};