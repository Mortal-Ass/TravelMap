import {test,expect} from '@playwright/test';
test('注册服务空响应时显示可理解的错误',async({page})=>{
 await page.route('**/api/auth/register',route=>route.fulfill({status:502,body:''}));
 await page.goto('/');
 await page.getByRole('button',{name:'第一次来？创建账号'}).click();
 await page.getByLabel('昵称').fill('故障验收');
 await page.getByLabel('邮箱').fill('error@example.com');
 await page.getByLabel('密码').fill('12345678');
 await page.getByRole('button',{name:'注册并开始'}).click();
 await expect(page.getByRole('alert')).toContainText('无法连接账号服务');
 await expect(page.getByRole('alert')).not.toContainText('JSON');
});
