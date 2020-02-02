for i in {35..65}
do
    node build.js -i ../links.txt -f "#$i" >../docs/$i.md
done