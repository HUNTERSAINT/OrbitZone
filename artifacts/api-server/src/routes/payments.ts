import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import {
  db,
  paymentsTable,
  usersTable,
} from "@workspace/db";
import {
  InitializePaymentBody,
  InitializePaymentResponse,
  VerifyPaymentBody,
  VerifyPaymentResponse,
} from "@workspace/api-zod";
import { requireUser } from "../middlewares/require-auth";

const router: IRouter = Router();
const DAY_MS = 24 * 60 * 60 * 1000;
const PLAN_DAYS = 7;
const PLAN_PRICES_KOBO = {
  premium: 150_000,
  hookup: 250_000,
} as const;

type Plan = keyof typeof PLAN_PRICES_KOBO;
type PaystackTransaction = {
  status: string;
  reference: string;
  amount: number;
  currency: string;
  paid_at?: string | null;
};
type PaystackApiResponse = {
  status: boolean;
  data?: PaystackTransaction;
};

const initializeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => req.currentUser!.id,
  message: { error: "Too many checkout attempts. Try again later." },
});
const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => req.currentUser!.id,
  message: { error: "Too many payment checks. Try again later." },
});

function daysRemaining(expiresAt: Date | null): number {
  if (!expiresAt || expiresAt.getTime() <= Date.now()) return 0;
  return Math.ceil((expiresAt.getTime() - Date.now()) / DAY_MS);
}

async function queryPaystack(reference: string): Promise<PaystackTransaction> {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new Error("PAYSTACK_SECRET_KEY is not configured.");

  const response = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(12_000),
    },
  );
  const result = (await response.json().catch(() => null)) as PaystackApiResponse | null;
  if (
    !response.ok ||
    !result ||
    result.status !== true ||
    !result.data ||
    typeof result.data.reference !== "string" ||
    typeof result.data.status !== "string" ||
    typeof result.data.amount !== "number" ||
    typeof result.data.currency !== "string"
  ) {
    throw new Error("Paystack transaction verification failed.");
  }
  return result.data;
}

function mapStatus(status: string): "success" | "pending" | "failed" {
  if (status === "success") return "success";
  if (["ongoing", "pending", "processing", "queued"].includes(status)) {
    return "pending";
  }
  return "failed";
}

async function applySuccessfulPayment(
  transaction: PaystackTransaction,
): Promise<"applied" | "already-applied" | "not-found" | "mismatch"> {
  return db.transaction(async (tx) => {
    const [payment] = await tx
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.reference, transaction.reference))
      .for("update")
      .limit(1);
    if (!payment) return "not-found";
    if (payment.status === "success") return "already-applied";

    if (
      transaction.status !== "success" ||
      transaction.reference !== payment.reference ||
      transaction.amount !== payment.amountKobo ||
      transaction.currency !== "NGN"
    ) {
      await tx
        .update(paymentsTable)
        .set({ status: "failed" })
        .where(eq(paymentsTable.id, payment.id));
      return "mismatch";
    }

    if (payment.userId) {
      const [user] = await tx
        .select({
          id: usersTable.id,
          premiumUntil: usersTable.premiumUntil,
          hookupUntil: usersTable.hookupUntil,
        })
        .from(usersTable)
        .where(eq(usersTable.id, payment.userId))
        .for("update")
        .limit(1);
      if (user) {
        const currentExpiry =
          payment.plan === "premium" ? user.premiumUntil : user.hookupUntil;
        const startingAt =
          currentExpiry && currentExpiry.getTime() > Date.now()
            ? currentExpiry.getTime()
            : Date.now();
        const expiry = new Date(startingAt + PLAN_DAYS * DAY_MS);
        if (payment.plan === "premium") {
          await tx
            .update(usersTable)
            .set({ premiumUntil: expiry })
            .where(eq(usersTable.id, user.id));
        } else {
          await tx
            .update(usersTable)
            .set({ hookupUntil: expiry })
            .where(eq(usersTable.id, user.id));
        }
      }
    }

    const paidAt =
      transaction.paid_at && !Number.isNaN(Date.parse(transaction.paid_at))
        ? new Date(transaction.paid_at)
        : new Date();
    await tx
      .update(paymentsTable)
      .set({ status: "success", paidAt })
      .where(eq(paymentsTable.id, payment.id));
    return "applied";
  });
}

async function setPaymentFailed(reference: string): Promise<void> {
  await db
    .update(paymentsTable)
    .set({ status: "failed" })
    .where(
      and(
        eq(paymentsTable.reference, reference),
        eq(paymentsTable.status, "pending"),
      ),
    );
}

async function currentEntitlements(userId: string) {
  const [user] = await db
    .select({
      premiumUntil: usersTable.premiumUntil,
      hookupUntil: usersTable.hookupUntil,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return {
    premiumUntil: user?.premiumUntil?.toISOString() ?? null,
    hookupUntil: user?.hookupUntil?.toISOString() ?? null,
    premiumDaysRemaining: daysRemaining(user?.premiumUntil ?? null),
    hookupDaysRemaining: daysRemaining(user?.hookupUntil ?? null),
  };
}

router.post(
  "/payments/initialize",
  requireUser,
  initializeLimiter,
  async (req, res): Promise<void> => {
    const parsed = InitializePaymentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Choose a plan and enter a valid billing email." });
      return;
    }
    const user = req.currentUser!;
    if (user.gender !== "male") {
      res.status(403).json({ error: "Women do not need a paid plan." });
      return;
    }

    const publicKey = process.env.PAYSTACK_PUBLIC_KEY;
    if (!publicKey || !process.env.PAYSTACK_SECRET_KEY) {
      res.status(503).json({ error: "Paystack payments are not configured." });
      return;
    }

    const plan: Plan = parsed.data.plan;
    const reference = `orbit-${randomUUID()}`;
    const amountKobo = PLAN_PRICES_KOBO[plan];
    await db.insert(paymentsTable).values({
      userId: user.id,
      reference,
      amountKobo,
      plan,
      status: "pending",
    });
    res.status(201).json(
      InitializePaymentResponse.parse({
        reference,
        plan,
        amountKobo,
        currency: "NGN",
        publicKey,
      }),
    );
  },
);

router.post(
  "/payments/verify",
  requireUser,
  verifyLimiter,
  async (req, res): Promise<void> => {
    const parsed = VerifyPaymentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Enter a valid payment reference." });
      return;
    }
    const user = req.currentUser!;
    if (user.gender !== "male") {
      res.status(403).json({ error: "Women do not need a paid plan." });
      return;
    }
    const reference = parsed.data.reference;
    const [payment] = await db
      .select()
      .from(paymentsTable)
      .where(
        and(
          eq(paymentsTable.reference, reference),
          eq(paymentsTable.userId, user.id),
        ),
      )
      .limit(1);
    if (!payment) {
      res.status(404).json({ error: "Payment reference was not found for this account." });
      return;
    }

    let transaction: PaystackTransaction;
    try {
      transaction = await queryPaystack(reference);
    } catch (error) {
      req.log.warn({ err: error, reference }, "Paystack verification request failed");
      res.status(502).json({ error: "Paystack could not verify this payment. Try again shortly." });
      return;
    }

    if (
      transaction.reference !== payment.reference ||
      transaction.amount !== payment.amountKobo ||
      transaction.currency !== "NGN"
    ) {
      await setPaymentFailed(reference);
      res.status(400).json({ error: "Payment details do not match this purchase." });
      return;
    }

    let status = mapStatus(transaction.status);
    if (status === "success") {
      const applied = await applySuccessfulPayment(transaction);
      if (applied === "not-found" || applied === "mismatch") {
        res.status(400).json({ error: "Payment details do not match this purchase." });
        return;
      }
    } else if (status === "failed") {
      await setPaymentFailed(reference);
    }

    const entitlements = await currentEntitlements(user.id);
    res.json(
      VerifyPaymentResponse.parse({
        reference,
        plan: payment.plan,
        status,
        ...entitlements,
      }),
    );
  },
);

router.post("/payments/webhook", async (req, res): Promise<void> => {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  const signature = req.get("x-paystack-signature") ?? "";
  if (!secret) {
    res.status(503).json({ error: "Paystack webhook verification is not configured." });
    return;
  }
  if (
    !req.rawBody ||
    !/^[a-f\d]{128}$/i.test(signature)
  ) {
    res.status(401).json({ error: "Invalid Paystack signature." });
    return;
  }
  const expected = createHmac("sha512", secret).update(req.rawBody).digest();
  const supplied = Buffer.from(signature, "hex");
  if (supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) {
    res.status(401).json({ error: "Invalid Paystack signature." });
    return;
  }

  const body = req.body as {
    event?: unknown;
    data?: { reference?: unknown };
  };
  if (body?.event !== "charge.success") {
    res.sendStatus(200);
    return;
  }
  const reference = body?.data?.reference;
  if (
    typeof reference !== "string" ||
    reference.length < 8 ||
    reference.length > 100
  ) {
    res.sendStatus(200);
    return;
  }

  try {
    const transaction = await queryPaystack(reference);
    if (transaction.status !== "success") {
      res.sendStatus(502);
      return;
    }
    const result = await applySuccessfulPayment(transaction);
    if (result === "mismatch") {
      req.log.warn({ reference }, "Signed Paystack event did not match its pending purchase");
    }
    res.sendStatus(200);
  } catch (error) {
    req.log.warn({ err: error, reference }, "Paystack webhook verification failed");
    res.status(502).json({ error: "Paystack webhook verification failed." });
  }
});

export default router;
