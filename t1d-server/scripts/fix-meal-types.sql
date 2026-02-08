-- Fix existing meals with null meal_type by inferring from timestamp
-- Breakfast: 5am - 11am
-- Lunch: 11am - 3pm  
-- Dinner: 3pm - 9pm
-- Snack: 9pm - 5am

UPDATE meals
SET meal_type = CASE
  WHEN EXTRACT(HOUR FROM timestamp AT TIME ZONE 'America/New_York') >= 5 
   AND EXTRACT(HOUR FROM timestamp AT TIME ZONE 'America/New_York') < 11 THEN 'breakfast'
  WHEN EXTRACT(HOUR FROM timestamp AT TIME ZONE 'America/New_York') >= 11 
   AND EXTRACT(HOUR FROM timestamp AT TIME ZONE 'America/New_York') < 15 THEN 'lunch'
  WHEN EXTRACT(HOUR FROM timestamp AT TIME ZONE 'America/New_York') >= 15 
   AND EXTRACT(HOUR FROM timestamp AT TIME ZONE 'America/New_York') < 21 THEN 'dinner'
  ELSE 'snack'
END
WHERE meal_type IS NULL;
