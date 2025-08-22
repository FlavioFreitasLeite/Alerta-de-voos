// Substitua o conteúdo do arquivo: app/api/create-alert/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import sgMail from '@sendgrid/mail';

// --- Tipos ---
interface FlightOffer {
  price: number;
  [key: string]: any;
}

interface PriceInsights {
    lowest_price: number;
    price_level: string;
    typical_price_range: [number, number];
}

// --- Inicializa os clientes ---
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Configura o SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

// --- Função de busca usando SerpApi ---
async function getGoogleFlightsPrice(
    origin: string, 
    destination: string, 
    departureDate: string, 
    returnDate: string | null, 
    passengers: number, 
    shortDuration: boolean
): Promise<{ lowestPrice: number | null; priceInsights: PriceInsights | null }> {
    try {
        const params = new URLSearchParams({
            engine: 'google_flights',
            api_key: process.env.SERPAPI_KEY!,
            departure_id: origin,
            arrival_id: destination,
            outbound_date: departureDate,
            adults: passengers.toString(),
            currency: 'BRL',
            hl: 'pt-br',
            gl: 'br',
            stops: shortDuration ? '1' : '0',
            deep_search: 'true',
        });

        if (returnDate) {
            params.append('return_date', returnDate);
        }

        const response = await fetch(`https://serpapi.com/search?${params.toString()}`);
        if (!response.ok) {
            throw new Error(`SerpApi respondeu com o status: ${response.status}`);
        }

        const data = await response.json();
        const allFlights: FlightOffer[] = [...(data.best_flights || []), ...(data.other_flights || [])];

        if (allFlights.length === 0) {
            return { lowestPrice: null, priceInsights: null };
        }

        const lowestPrice = allFlights.reduce((min, flight) => 
            flight.price < min ? flight.price : min, 
            allFlights[0].price
        );

        return { lowestPrice, priceInsights: data.price_insights || null };

    } catch (error) {
        console.error("Erro na busca da SerpApi (Google Flights):", error);
        return { lowestPrice: null, priceInsights: null };
    }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      origin,
      destination,
      departureDate,
      returnDate,
      passengers,
      userEmail,
      shortDuration,
    } = body;

    if (!origin || !destination || !departureDate || !userEmail) {
      return NextResponse.json({ error: 'Dados incompletos.' }, { status: 400 });
    }

    const { lowestPrice, priceInsights } = await getGoogleFlightsPrice(origin, destination, departureDate, returnDate, passengers, shortDuration);

    if (lowestPrice === null) {
        return NextResponse.json({ error: 'Nenhum voo encontrado. Tente outras datas ou aeroportos.' }, { status: 404 });
    }
    
    const initialPrice = lowestPrice;
    console.log(`Preço mais baixo encontrado (Google Flights): R$ ${initialPrice}`);

    let priceContextMessage = '';
    if (priceInsights) {
        const level = priceInsights.price_level?.toLowerCase();
        const typicalRange = priceInsights.typical_price_range;
        if (level) {
            priceContextMessage = `Este preço é considerado <strong>${level.toUpperCase()}</strong> para esta rota (normalmente entre R$${typicalRange[0]} e R$${typicalRange[1]}).`;
        }
    }

    const purchaseLink = `https://www.google.com/travel/flights?q=Flights%20from%20${origin}%20to%20${destination}%20on%20${departureDate}${returnDate ? `%20through%20${returnDate}` : ''}`;

    await supabase.from('alerts').insert([{
        user_email: userEmail, origin, destination, departure_date: departureDate,
        return_date: returnDate, passengers, last_price: initialPrice,
        purchase_link: purchaseLink, short_duration: shortDuration,
    }]);

    const formattedPrice = initialPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    
    // --- Lógica de envio com SendGrid ---
    const msg = {
        to: userEmail,
        from: 'flaviofreitasleite@gmail.com', // IMPORTANTE: Use o seu e-mail verificado no SendGrid
        subject: `Seu Alerta de Voo foi Criado! (${origin} -> ${destination})`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6;">
            <h1>Alerta de Preço Ativado!</h1>
            <p>Olá!</p>
            <p>Confirmamos a criação do seu alerta para o voo de <strong>${origin}</strong> para <strong>${destination}</strong>.</p>
            <p>O preço mais baixo que encontramos foi de <strong style="font-size: 1.2em;">${formattedPrice}</strong>.</p>
            ${priceContextMessage ? `<p style="background-color: #e8f0fe; padding: 10px; border-radius: 8px;">${priceContextMessage}</p>` : ''}
            <a href="${purchaseLink}" target="_blank" style="display: inline-block; padding: 12px 24px; margin: 20px 0; font-size: 16px; color: white; background-color: #1a73e8; text-decoration: none; border-radius: 8px;">
              Ver Oferta no Google Flights
            </a>
            <br><br>
            <p>Boa viagem!</p>
            <p><em>Equipe Alerta de Voos</em></p>
          </div>
        `,
    };
    
    await sgMail.send(msg);

    return NextResponse.json({ message: 'Alerta criado com sucesso! Enviamos um e-mail de confirmação.' });

  } catch (error) {
    console.error('Erro na API /create-alert:', error);
    const errorMessage = error instanceof Error ? error.message : 'Ocorreu um erro desconhecido.';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
