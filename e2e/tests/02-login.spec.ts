import { test, expect } from '../fixtures/auth';

test('user is signed in after MFA and lands on the authenticated area', async ({
  authedPage,
}) => {
  await expect(authedPage).not.toHaveURL(/login/i);
  await expect(
    authedPage.getByRole('img', { name: 'OQTOPUS Playground' }),
  ).toBeVisible();
});
