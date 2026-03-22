import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const endpoints = [
    'https://api.reliefweb.int/v1/disasters?appname=rw-api-explorer&limit=20&profile=full',
    'https://api.reliefweb.int/v1/reports?appname=rw-api-explorer&limit=20&profile=full&filter[field]=primary_type.name&filter[value]=Disaster',
  ];

  for (const url of endpoints) {
    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.data?.length > 0) return res.json(data);
      }
    } catch (error) {
      console.error(`ReliefWeb error for ${url}:`, error);
    }
  }

  res.json({ data: [] });
}
