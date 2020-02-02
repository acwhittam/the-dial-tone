for i in {11..65}
do
    node build.js -i ../links.txt -f "#$i" >../docs/$i.md
done