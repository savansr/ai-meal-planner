import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma"; // <-- import Prisma client
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET as string;

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  let event: Stripe.Event;

  // Verify Stripe event is legit
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature || "",
      webhookSecret
    );
  } catch (err: unknown) {

   let errorMessage = "";

  // Check if the error is an instance of Error before accessing `.message`
  if (err instanceof Error) {
    errorMessage = err.message;
  }
    
    console.error(`Webhook signature verification failed. ${errorMessage}`);
    return NextResponse.json({ error: errorMessage }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutSessionCompleted(session);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaymentFailed(invoice);
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }
      // Add more event types as needed
      default:
        console.log(`Unhandled event type ${event.type}`);
    }
  } catch (err: unknown) {

    let errorMessage = "";

  // Check if the error is an instance of Error before accessing `.message`
  if (err instanceof Error) {
    errorMessage = err.message;
  }
    
    console.error(`stripe error: ${errorMessage} | EVENT TYPE: ${event.type}`);
    return NextResponse.json({ error: errorMessage }, { status: 400 });
  }

  return NextResponse.json({});
}

// Handler for successful checkout sessions
const handleCheckoutSessionCompleted = async (
  session: Stripe.Checkout.Session
) => {
  const userId = session.metadata?.clerkUserId;
  console.log("Handling checkout.session.completed for user:", userId);

  if (!userId) {
    console.error("No userId found in session metadata.");
    return;
  }

  // Retrieve subscription ID from the session
  const subscriptionId = session.subscription as string;

  if (!subscriptionId) {
    console.error("No subscription ID found in session.");
    return;
  }


  // Update Prisma with subscription details
  try {
    await prisma.profile.update({
      where: { userId },
      data: {
        stripeSubscriptionId: subscriptionId,
        subscriptionActive: true,
        subscriptionTier: session.metadata?.planType || null,
      },
    });
    console.log(`Subscription activated for user: ${userId}`);
  } catch (error:unknown) {
    console.error("Prisma Update Error:", error);
  }
};

// Handler for failed invoice payments
const handleInvoicePaymentFailed = async (invoice: Stripe.Invoice) => {
  const subscriptionId = invoice.subscription as string;
  console.log(
    "Handling invoice.payment_failed for subscription:",
    subscriptionId
  );

  if (!subscriptionId) {
    console.error("No subscription ID found in invoice.");
    return;
  }

  // Retrieve userId from subscription ID
  let userId: string | undefined;
  try {
    const profile = await prisma.profile.findUnique({
      where: { stripeSubscriptionId: subscriptionId },
      select: { userId: true },
    });

    if (!profile?.userId) {
      console.error("No profile found for this subscription ID.");
      return;
    }

    userId = profile.userId;
  } catch (error: unknown) {
    console.error("Prisma Query Error:", error);
    return;
  }

  // Update Prisma with payment failure
  try {
    await prisma.profile.update({
      where: { userId },
      data: {
        subscriptionActive: false,
      },
    });
    console.log(`Subscription payment failed for user: ${userId}`);
  } catch (error:unknown) {
    console.error("Prisma Update Error:", error);
  }
};

// Handler for subscription deletions (e.g., cancellations)
const handleSubscriptionDeleted = async (subscription: Stripe.Subscription) => {
  const subscriptionId = subscription.id;
  console.log(
    "Handling customer.subscription.deleted for subscription:",
    subscriptionId
  );

  // Retrieve userId from subscription ID
  let userId: string | undefined;
  try {
    const profile = await prisma.profile.findUnique({
      where: { stripeSubscriptionId: subscriptionId },
      select: { userId: true },
    });

    if (!profile?.userId) {
      console.error("No profile found for this subscription ID.");
      return;
    }

    userId = profile.userId;
  } catch (error: unknown) {
    console.error("Prisma Query Error:", error);
    return;
  }

  // Update Prisma with subscription cancellation
  try {
    await prisma.profile.update({
      where: { userId },
      data: {
        subscriptionActive: false,
        stripeSubscriptionId: null,
      },
    });
    console.log(`Subscription canceled for user: ${userId}`);
  } catch (error: unknown) {
    console.error("Prisma Update Error:", error);
  }
};
