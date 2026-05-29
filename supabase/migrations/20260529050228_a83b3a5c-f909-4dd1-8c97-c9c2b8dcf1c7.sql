UPDATE public.profiles
SET username = 'arleydavies',
    display_name = COALESCE(NULLIF(display_name, ''), 'Arley Davies'),
    pin_hash = extensions.crypt('18021974', extensions.gen_salt('bf')),
    onboarding_completed = true,
    updated_at = now()
WHERE email = 'sparckonmeta@gmail.com';