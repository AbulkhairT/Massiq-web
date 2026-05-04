# Massiq-web
MassIQ — AI Fitness System Turns body + food images into adaptive plans Built with Next.js, Supabase, Stripe, Claude Includes: Scan → analysis pipeline Decision engine (plan adaptation over time) Nutrition + workout generation.

Most fitness apps are static trackers — they don’t adapt to real body changes or user behavior over time
Users get one-off plans that quickly become irrelevant, leading to drop-off and inconsistency
Body composition tracking is fragmented (manual input, separate tools, low feedback loops)


Built a decision engine that maintains plan continuity (10–12 week cycles) and adapts nutrition/training based on new scan inputs instead of resetting users
Designed a scan → stabilization → adaptation pipeline, including confidence thresholds and multi-scan smoothing to avoid noisy or inconsistent outputs
Implemented a hybrid AI system combining image analysis + structured plan generation, with backend logic enforcing macro accuracy and progression rules
