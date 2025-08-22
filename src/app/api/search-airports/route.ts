// Substitua o conteúdo do arquivo: app/api/search-airports/route.ts
import { NextResponse } from 'next/server';
import Amadeus from 'amadeus';
import { CityData, Airport } from '@/app/types';
import { AmadeusCityResponse } from '@/app/types';
// Inicializa o cliente da Amadeus
const amadeus = new Amadeus({
  clientId: process.env.AMADEUS_API_KEY!,
  clientSecret: process.env.AMADEUS_API_SECRET!,
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get('keyword');

  if (!keyword || keyword.length < 3) {
    return NextResponse.json([]);
  }

  try {
    // Remove acentos para compatibilidade com a API
    const sanitizedKeyword = keyword
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    console.log(`Buscando pela cidade: "${sanitizedKeyword}"`);

    // CORRIGIDO: Usando o endpoint correto de busca de cidades com base na sua documentação
    const response = await amadeus.referenceData.locations.cities.get({
      keyword: sanitizedKeyword,
      countryCode: 'BR',
      include: 'AIRPORTS',
    });

    const airportsData = (response as unknown as AmadeusCityResponse).result.included?.airports || {};
    const results: Airport[] = [];

    if (response.data) {
      (response.data as CityData[]).forEach((city: CityData) => {
        city.relationships?.forEach((relation: { type: string; id: string }) => {
          if (relation.type === 'Airport') {
            const airport = airportsData[relation.id];
            if (airport) {
              results.push({
                name: `${city.name.toLowerCase()}, ${airport.name.toLowerCase()} (${airport.iataCode})`,
                iataCode: airport.iataCode,
              });
            }
          }
        });
      });
    }

    console.log(`Encontrados ${results.length} aeroportos.`);
    return NextResponse.json(results);

  } catch (error: unknown) {
    console.error("Erro ao buscar cidades/aeroportos na Amadeus:", error);
    return NextResponse.json({ error: 'Erro ao buscar dados.' }, { status: 500 });
  }
}