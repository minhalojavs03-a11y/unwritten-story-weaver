DELETE FROM public.whatsapp_instances
WHERE id IN (
  '4beb12f8-c166-415e-bed8-f646947d70df',  -- sem telefone, connecting desde 04/06
  'cc15bdaa-ef11-4846-9e5e-2a010cd43b77',  -- sem telefone, connecting desde 03/06
  '0540709d-355c-43a3-ae16-ff3991f9dc88',  -- sparckonmeta, sem telefone, connecting
  '6d2d8eee-bac9-46bc-92b1-6efef33c0b8e',  -- Antonio Gross 554792352804 fantasma (duplicata desconectada do número oficial)
  'd078e0b4-f318-492b-97a3-d78f614cb012',  -- Diessica 554784800175 duplicata antiga
  '59e04877-8f01-44ad-b5e1-87a0567c040b'   -- Gregory 554792477287 duplicata antiga
);