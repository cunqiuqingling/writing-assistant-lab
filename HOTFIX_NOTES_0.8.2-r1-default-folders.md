# 0.8.2-R1 · 默认细分类文件夹可删除

此前所有预置目录都被统一标记为`system`，导致顶层结构和普通细分类一起被保护。现在改为：

## 始终保护的结构目录

- 全部材料
- IELTS Writing
- Academic Writing
- Pharmacy & Biomedicine
- Literature
- My Library

这些目录承担练习库的主结构，仍然不能删除。

## 可以删除的预置细分类

例如：

- Education、Technology、Healthcare
- Introduction、Methods、Results、Discussion
- HIV、Drug Development、Pharmacology
- Novels、Essays、Speeches
- Imported Books、Imported Papers、Custom Materials

这些默认细分类会显示`•••`管理入口，并提供“删除默认文件夹”。

## 删除行为

- 只从当前浏览器的练习库目录中移除该默认文件夹；
- 自建材料和自建子文件夹移动到上一级；
- 内置示例材料也在上一级继续显示；
- 不删除材料正文、章节、练习记录或AI配置；
- 练习库侧栏会出现“恢复默认目录”，可一次恢复所有被移除的预置目录。

版本仍为0.8.2-R1，storage schema仍为5。
