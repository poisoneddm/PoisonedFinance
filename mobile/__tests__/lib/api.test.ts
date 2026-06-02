import { apiUpload } from '@/lib/api';

// Preserve original fetch
const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

describe('apiUpload', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_URL = 'http://localhost:3000';
  });

  it('POSTs multipart FormData and returns parsed JSON on success', async () => {
    const mockResponse = { ok: true, imported: 2 };
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    }) as jest.Mock;

    const formData = new FormData();
    formData.append('userId', '00000000-0000-0000-0000-000000000001');

    const result = await apiUpload('/import/pdf', formData);

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('http://localhost:3000/import/pdf');
    // Must NOT set Content-Type manually — let fetch set the multipart boundary
    expect((init.headers as Record<string, string> | undefined)?.['Content-Type']).toBeUndefined();
    expect(init.method).toBe('POST');
    expect(init.body).toBe(formData);
    expect(result).toEqual(mockResponse);
  });

  it('throws when the response is not ok', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    }) as jest.Mock;

    const formData = new FormData();
    await expect(apiUpload('/import/pdf', formData)).rejects.toThrow('500');
  });
});
