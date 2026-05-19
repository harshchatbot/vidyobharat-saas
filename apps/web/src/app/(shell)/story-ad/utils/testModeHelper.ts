// Helper functions for test mode

export function getTestMode(): 'real' | 'mock' | null {
  if (typeof window === 'undefined') return null;
  return (sessionStorage.getItem('testMode') as 'real' | 'mock' | null) || null;
}

export function isTestModeEnabled(): boolean {
  return getTestMode() === 'mock';
}

export function isRealMode(): boolean {
  return getTestMode() === 'real';
}

export function clearTestMode(): void {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('testMode');
  }
}
