// Substitua o conteúdo do arquivo: app/api/search-airports/route.ts
import { NextResponse } from 'next/server';
import Amadeus from 'amadeus';

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
      countryCode: 'BR', // Prioriza o Brasil
      include: 'AIRPORTS', // Inclui os aeroportos da cidade na resposta
    });

    const airportsData = response.result.included?.airports || {};
    const results: { name: string; iataCode: string }[] = [];

    // Processa a resposta para extrair os aeroportos
    if (response.data) {
      response.data.forEach((city: any) => {
        city.relationships?.forEach((relation: any) => {
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

  } catch (error: any) {
    console.error("Erro ao buscar cidades/aeroportos na Amadeus:", error);
    return NextResponse.json({ error: 'Erro ao buscar dados.' }, { status: 500 });
  }
}
