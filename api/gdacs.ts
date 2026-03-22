import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const gdacsUrls = [
    'https://www.gdacs.org/xml/rss.xml',
    'https://www.gdacs.org/gdacsapi/api/events/geteventlist/json',
    'https://www.gdacs.org/datarecipe/resources/gdacs.json',
  ];

  for (const url of gdacsUrls) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'application/json, application/xml, text/xml, */*',
        },
      });

      if (!response.ok) continue;

      const contentType = response.headers.get('content-type') || '';
      const text = await response.text();

      if (contentType.includes('application/json') || url.endsWith('.json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
        try {
          const data = JSON.parse(text);

          if (Array.isArray(data)) {
            const features = data.map((item: any) => ({
              type: 'Feature',
              properties: {
                eventid: item.eventid,
                eventname: item.eventname,
                eventtype: item.eventtype,
                alertlevel: item.alertlevel,
                fromdate: item.fromdate,
                description: item.description,
                url: { report: item.url },
              },
              geometry: {
                type: 'Point',
                coordinates: [parseFloat(item.longitude), parseFloat(item.latitude)],
              },
            }));
            if (features.length > 0) return res.json({ features });
          }

          if (data?.features?.length > 0) return res.json(data);
        } catch {}
      }

      if (contentType.includes('xml') || url.endsWith('.xml') || text.trim().startsWith('<')) {
        const features: any[] = [];
        const items = text.match(/<item>[\s\S]*?<\/item>/g) || [];

        items.forEach(item => {
          const title = (item.match(/<title>(.*?)<\/title>/)?.[1] || 'Unknown Event')
            .replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();
          const description = (item.match(/<description>(.*?)<\/description>/)?.[1] || '')
            .replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();
          const link = item.match(/<link>(.*?)<\/link>/)?.[1] || '';
          const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';

          let lat = parseFloat(item.match(/<geo:lat>(.*?)<\/geo:lat>/)?.[1] || '0');
          let lng = parseFloat(item.match(/<geo:long>(.*?)<\/geo:long>/)?.[1] || '0');

          if (lat === 0 && lng === 0) {
            const point = item.match(/<georss:point>(.*?)<\/georss:point>/)?.[1];
            if (point) {
              const [pLat, pLng] = point.trim().split(/\s+/);
              lat = parseFloat(pLat);
              lng = parseFloat(pLng);
            }
          }

          features.push({
            type: 'Feature',
            properties: {
              eventid: item.match(/<gdacs:eventid>(.*?)<\/gdacs:eventid>/)?.[1] || Math.random().toString(),
              eventname: title,
              eventtype: item.match(/<gdacs:eventtype>(.*?)<\/gdacs:eventtype>/)?.[1] || 'Unknown',
              alertlevel: item.match(/<gdacs:alertlevel>(.*?)<\/gdacs:alertlevel>/)?.[1] || 'Green',
              fromdate: pubDate,
              description,
              url: { report: link },
            },
            geometry: { type: 'Point', coordinates: [lng, lat] },
          });
        });

        if (features.length > 0) return res.json({ features });
      }
    } catch (error) {
      console.error(`GDACS error for ${url}:`, error);
    }
  }

  res.status(500).json({ error: 'Failed to fetch GDACS data from all sources' });
}
