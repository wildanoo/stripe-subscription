import prisma from "@/db/prisma";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: Request) {
    const body = await req.text();

    const sig = req.headers.get("stripe-signature")!;
    let event: Stripe.Event;

    try {
        event = stripe.webhooks.constructEvent(body, sig, WEBHOOK_SECRET)
    } catch (err: any) {
        console.error("Webhook signature verification failed.", err.message);
        return new Response(`Webhook error: ${err.message}`, { status: 400 })
    }

    //handle events

    try {
        switch (event.type) {
            case "checkout.session.completed":
                const session = await stripe.checkout.sessions.retrieve(
                    (event.data.object as Stripe.Checkout.Session).id,
                    {
                        expand: ['line_items']
                    }
                )

                const customerId = session.customer as string;
                const customerDetails = session.customer_details;

                if (customerDetails?.email) {
                    const user = await prisma.user.findUnique({ where: { email: customerDetails.email } })
                    if (!user) throw new Error("User not found");

                    if (!user.customerId) {
                        await prisma.user.update({
                            where: { id: user.id }, data: { customerId }
                        })
                    }
                    const lineItems = session.line_items?.data || [];

                    for (const item of lineItems) {
                        const priceId = item.price?.id;
                        const isSubscription = item.price?.type === 'recurring';

                        if (isSubscription) {
                            let endDate = new Date();
                            if (priceId === process.env.STRIPE_YEARLY_PRICE_ID!) {
                                endDate.setFullYear(endDate.getFullYear() + 1)
                            } else if (priceId === process.env.STRIPE_MONTHLY_PRICE_ID!) {
                                endDate.setFullYear(endDate.getMonth() + 1)
                            } else {
                                throw new Error('Invalid priceID')
                            }

                            await prisma.subscription.upsert({
                                where: { userId: user.id! },
                                create: {
                                    userId: user.id!,
                                    startDate: new Date(),
                                    endDate: endDate,
                                    plan: 'premium',
                                    period: priceId === process.env.STRIPE_YEARLY_PRICE_ID! ? 'yearly' : 'monthly'
                                },
                                update: {
                                    startDate: new Date(),
                                    endDate: endDate,
                                    plan: 'premium',
                                    period: priceId === process.env.STRIPE_YEARLY_PRICE_ID! ? 'yearly' : 'monthly'
                                }
                            })

                            await prisma.user.update({
                                where: { id: user.id! },
                                data: { plan: 'premium' }
                            })
                        } else {
                            // onetime purchase
                        }
                    }
                }

                break;
            case "customer.subscription.deleted": {
                const subscription = await stripe.subscriptions.retrieve((event.data.object as Stripe.Subscription).id);
                const user = await prisma.user.findUnique({ where: { customerId: subscription.customer as string } });
                if (user) {
                    await prisma.user.update({
                        where: { id: user.id! },
                        data: { plan: 'free' }
                    })
                } else {
                    console.error("User not found for the subscription deleted event");
                    throw new Error("User not found for the subscription deleted event");
                }
            }
            default:
                console.log(`Unhandled event type ${event.type}`)

        }
    } catch (err: any) {
        console.error("Error handling event", err);
        return new Response('Webhook error', { status: 400 })
    }

    return new Response("Webhook received", { status: 200 })

}