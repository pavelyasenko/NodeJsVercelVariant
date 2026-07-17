const API_KEY = process.env.PEXELS_API_KEY!;

export async function getImage(query: string): Promise<string> {
    try {
        const response = await fetch(
            `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1`,
            {
                headers: {
                    Authorization: API_KEY,
                },
            }
        );

        const data = await response.json();

        if (data.photos?.length) {
            return data.photos[0].src.large2x;
        }

        return "https://picsum.photos/1200/800";
    } catch {
        return "https://picsum.photos/1200/800";
    }
}