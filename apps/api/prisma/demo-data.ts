import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();


async function main(){


const tenant =
await prisma.tenant.findFirst({
 where:{
  name:"SmartCS官方演示商家"
 }
});


if(!tenant){
 throw new Error("tenant不存在");
}



const bot =
await prisma.bot.findFirst({

 where:{
  tenantId:tenant.id,
  name:"SmartCS AI销售助手"
 }

});


if(!bot){
 throw new Error("bot不存在");
}



// 增加商业FAQ

await prisma.knowledge.create({

 data:{

 title:"SmartCS商业FAQ",

 botId:bot.id,

 content:`

# SmartCS 常见问题


## Q: SmartCS是什么？

A:

SmartCS是一套AI智能客服系统。

帮助企业自动回复客户咨询，提高销售效率。


---

## Q: 适合什么企业？

适合：

- 电商商家
- 淘宝店铺
- 小红书商家
- 微信私域商家
- SaaS企业


---

## Q: AI客服能做什么？

可以：

1. 自动回答客户问题

2. 介绍商品

3. 处理售后咨询

4. 引导客户购买

5. 收集客户需求


---

## Q: 是否支持自己的资料？

支持。

商家可以上传：

PDF

Word

产品介绍

价格表

FAQ


AI根据企业资料回答。


---

## Q: 人工客服还需要吗？

需要。

AI负责80%的重复问题。

人工处理：

- 高价值客户
- 投诉
- 特殊订单


---

## Q: 多少钱？

基础版：

299元/月


专业版：

999元/月


企业版：

定制。


---

## Q: 有免费体验吗？

支持申请体验。

`

 }

});



await prisma.knowledge.create({

 data:{

 title:"客服销售话术",

 botId:bot.id,

 content:`

销售流程：

第一步：

了解客户行业。


第二步：

询问客户痛点。


例如：

您好，请问您目前主要在哪个平台经营？


第三步：

介绍价值：

SmartCS可以帮助您：

降低客服成本

提高回复速度

减少客户流失。


第四步：

邀请体验：

可以免费体验AI客服效果。


`

 }

});


console.log("demo data ok");


}


main()
.finally(()=>prisma.$disconnect());
