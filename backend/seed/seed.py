"""Seeds a demo restaurant with relative-dated order data (so "yesterday" and
"last week" queries actually resolve correctly whenever this is run) and the
SLA policy document. Run from backend/:

    python -m seed.seed
"""

import asyncio
import random
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from app.config import settings
from app.db import close_pool, get_pool
from app.services.ingestion import ingest_policy_document

RESTAURANT_ID = uuid.UUID(settings.demo_restaurant_id)
ZONES = ["Zone 1", "Zone 2", "Zone 3"]
PLATFORMS = ["swiggy", "zomato"]

# The exact eligible/excluded set from the UI mockup's Screen 02, dated as
# "yesterday" relative to whenever this script runs — keeps the demo
# narrative reproducible without a stale hardcoded date.
# delivery_s below = SLA target (2400s) + the delay-in-minutes shown in the
# mockup's table, so the deterministic eligibility rules (compensation_rules.py)
# classify these exactly the way the mockup depicts them.
MOCKUP_CANCELLATIONS = [
    ("4021", "Zone 3", "swiggy", "weather_delay", True, 2400 + 38 * 60, 560),
    ("4198", "Zone 3", "zomato", "weather_delay", True, 2400 + 22 * 60, 410),
    ("4203", "Zone 3", "swiggy", "courier_no_show", False, 2400 + 45 * 60, 720),
    ("4212", "Zone 3", "zomato", "restaurant_closed_early", False, 2400 + 12 * 60, 340),
    ("4177", "Zone 3", "swiggy", "customer_cancelled_predispatch", False, None, 290),
    ("4190", "Zone 3", "zomato", "customer_cancelled_predispatch", False, None, 510),
]


async def seed_restaurant(conn):
    await conn.execute(
        """insert into restaurants (id, name, aggregator_platform, timezone)
           values ($1, 'Demo Tandoor Express', 'multi', 'Asia/Kolkata')
           on conflict (id) do nothing""",
        RESTAURANT_ID,
    )


async def seed_orders(conn):
    now = datetime.now(timezone.utc)
    yesterday = now - timedelta(days=1)

    next_id = 5000

    async def insert_order(order_id, placed_at, zone, platform, status, amount,
                            prep_s, delivery_s, reason, weather):
        await conn.execute(
            """insert into orders
               (restaurant_id, aggregator_order_id, placed_at, zone, platform, status,
                total_amount, prep_time_seconds, delivery_time_seconds, is_cancelled,
                cancellation_reason, weather_flag)
               values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)""",
            RESTAURANT_ID, order_id, placed_at, zone, platform, status,
            amount, prep_s, delivery_s, status == "cancelled", reason, weather,
        )

    # The exact mockup narrative, dated yesterday.
    for order_id, zone, platform, reason, weather, delivery_s, amount in MOCKUP_CANCELLATIONS:
        placed = yesterday.replace(hour=random.randint(18, 22), minute=random.randint(0, 59))
        await insert_order(order_id, placed, zone, platform, "cancelled", amount,
                            random.randint(600, 1200), delivery_s, reason, weather)

    # A spread of normal delivered orders over the last 14 days so
    # aggregate/average questions have real signal behind them.
    for day_offset in range(14):
        day = now - timedelta(days=day_offset)
        for _ in range(random.randint(8, 14)):
            next_id += 1
            zone = random.choice(ZONES)
            platform = random.choice(PLATFORMS)
            placed = day.replace(hour=random.randint(9, 22), minute=random.randint(0, 59))
            delivery_s = random.randint(1400, 2300)
            amount = round(random.uniform(200, 750), 2)
            weather = random.random() < 0.08
            if random.random() < 0.1:
                reason = random.choice([
                    "weather_delay", "courier_no_show",
                    "restaurant_closed_early", "customer_cancelled_predispatch",
                ])
                await insert_order(str(next_id), placed, zone, platform, "cancelled", amount,
                                    random.randint(600, 1200),
                                    None if reason == "customer_cancelled_predispatch" else random.randint(2400, 3200),
                                    reason, weather)
            else:
                await insert_order(str(next_id), placed, zone, platform, "delivered", amount,
                                    random.randint(500, 900), delivery_s, None, weather)


async def main():
    pool = await get_pool()
    async with pool.acquire() as conn:
        await seed_restaurant(conn)
        # idempotency for repeat runs during a demo
        await conn.execute("delete from orders where restaurant_id = $1", RESTAURANT_ID)
        await seed_orders(conn)
        existing_docs = await conn.fetchval(
            "select count(*) from policy_documents where restaurant_id = $1", RESTAURANT_ID
        )

    if existing_docs == 0:
        policy_text = (Path(__file__).parent / "sla_policy_v3.md").read_text()

        result = await ingest_policy_document(
            text=policy_text,
            source_name="sla_policy_v3.md",
            doc_type="sla",
            effective_date=date.today() - timedelta(days=30),
            restaurant_id=str(RESTAURANT_ID),
        )
        print(f"Indexed policy doc: {result}")
    else:
        print("Policy doc already indexed, skipping.")

    print("Seed complete.")
    await close_pool()


if __name__ == "__main__":
    asyncio.run(main())
